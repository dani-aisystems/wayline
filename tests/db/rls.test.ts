/**
 * Who can see and change what. Each test signs in as a real user and tries something through the public
 * API; the database's row-level security (supabase/migrations/*_classroom_core.sql) decides.
 *
 * Cast: two teachers (A, B), each with a class and one student, a student with no class, and an admin.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonymous, createUser, dbConfigured, deleteUsers, NOT_CONFIGURED, type TestUser } from "./harness.js";

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

describe.skipIf(!dbConfigured)(`database rules (${dbConfigured ? "live" : NOT_CONFIGURED})`, () => {
  let teacherA: TestUser, teacherB: TestUser, studentA: TestUser, studentB: TestUser, loner: TestUser, adminUser: TestUser;
  let classA: { id: string; join_code: string }, classB: { id: string; join_code: string };

  beforeAll(async () => {
    [teacherA, teacherB, studentA, studentB, loner, adminUser] = await Promise.all([
      createUser("teacherA", "teacher"),
      createUser("teacherB", "teacher"),
      createUser("studentA", "student"),
      createUser("studentB", "student"),
      createUser("loner", "student"),
      createUser("admin", "admin"),
    ]);
    const a = await teacherA.client.from("classes").insert({ name: "11А" }).select("id, join_code").single();
    const b = await teacherB.client.from("classes").insert({ name: "11Б" }).select("id, join_code").single();
    if (a.error || b.error) throw new Error(`create classes: ${a.error?.message ?? b.error?.message}`);
    classA = a.data;
    classB = b.data;
    for (const [s, c] of [[studentA, classA], [studentB, classB]] as const) {
      const { error } = await s.client.rpc("join_class", { code: c.join_code });
      if (error) throw new Error(`join: ${error.message}`);
    }
  }, 60_000);

  afterAll(async () => {
    await deleteUsers([teacherA, teacherB, studentA, studentB, loner, adminUser].filter(Boolean));
  });

  describe("accounts and roles", () => {
    it("a new account is always a student, whatever the sign-up form sends", async () => {
      const { data, error } = await admin().auth.admin.createUser({
        email: `rls-sneaky-${Date.now()}@example.test`,
        password: "Wayline-test-password-1",
        email_confirm: true,
        user_metadata: { display_name: "Sneaky", role: "admin" },
      });
      expect(error).toBeNull();
      const { data: profile } = await admin().from("profiles").select("role, display_name").eq("id", data.user!.id).single();
      expect(profile).toEqual({ role: "student", display_name: "Sneaky" });
      await admin().auth.admin.deleteUser(data.user!.id);
    });

    it("a student cannot make themself a teacher", async () => {
      const { error } = await studentA.client.from("profiles").update({ role: "teacher" }).eq("id", studentA.id);
      expect(error?.code).toBe("42501"); // permission denied: role is not an updatable column
      const { data } = await admin().from("profiles").select("role").eq("id", studentA.id).single();
      expect(data?.role).toBe("student");
    });

    it("anyone can change their own display name, but not someone else's", async () => {
      const own = await studentA.client.from("profiles").update({ display_name: "Ани" }).eq("id", studentA.id).select();
      expect(own.data).toHaveLength(1);
      const other = await studentA.client.from("profiles").update({ display_name: "Hacked" }).eq("id", studentB.id).select();
      expect(other.data).toEqual([]); // the row is invisible, so nothing is updated
    });

    it("only an admin can change a role, and not their own", async () => {
      expect((await teacherA.client.rpc("set_role", { target: loner.id, new_role: "teacher" })).error?.code).toBe("42501");
      expect((await adminUser.client.rpc("set_role", { target: adminUser.id, new_role: "student" })).error?.code).toBe("42501");
      expect((await adminUser.client.rpc("set_role", { target: loner.id, new_role: "teacher" })).error).toBeNull();
      expect((await admin().from("profiles").select("role").eq("id", loner.id).single()).data?.role).toBe("teacher");
      expect((await adminUser.client.rpc("set_role", { target: loner.id, new_role: "student" })).error).toBeNull();
    });
  });

  describe("classes", () => {
    it("a teacher gets a 6-character code chosen by the database", () => {
      expect(classA.join_code).toMatch(CODE);
      expect(classB.join_code).toMatch(CODE);
      expect(classA.join_code).not.toBe(classB.join_code);
    });

    it("a student cannot create a class", async () => {
      const { error } = await studentA.client.from("classes").insert({ name: "Fake" });
      expect(error?.code).toBe("42501");
    });

    it("nobody can choose or change a join code", async () => {
      expect((await teacherA.client.from("classes").insert({ name: "X", join_code: "AAAAAA" })).error?.code).toBe("42501");
      expect((await teacherA.client.from("classes").update({ join_code: "AAAAAA" }).eq("id", classA.id)).error?.code).toBe("42501");
    });

    it("teacher A cannot read, rename or delete teacher B's class", async () => {
      expect((await teacherA.client.from("classes").select("*").eq("id", classB.id)).data).toEqual([]);
      expect((await teacherA.client.from("classes").update({ name: "Mine now" }).eq("id", classB.id).select()).data).toEqual([]);
      expect((await teacherA.client.from("classes").delete().eq("id", classB.id).select()).data).toEqual([]);
      expect((await admin().from("classes").select("name").eq("id", classB.id).single()).data?.name).toBe("11Б");
    });
  });

  describe("joining", () => {
    it("a student joins with the code and the moment of consent is recorded", async () => {
      const { data } = await studentA.client.from("class_members").select("class_id, consent_at").single();
      expect(data?.class_id).toBe(classA.id);
      expect(Date.parse(data!.consent_at)).toBeGreaterThan(Date.now() - 120_000);
    });

    it("codes work in lower case and with spaces; a wrong code is refused", async () => {
      const ok = await loner.client.rpc("join_class", { code: ` ${classB.join_code.toLowerCase()} ` });
      expect(ok.data).toEqual([{ class_id: classB.id, class_name: "11Б" }]);
      await loner.client.from("class_members").delete().eq("student_id", loner.id);
      expect((await loner.client.rpc("join_class", { code: "ZZZZZ2" })).error?.code).toBe("P0002");
    });

    it("a teacher cannot join a class as a student", async () => {
      expect((await teacherA.client.rpc("join_class", { code: classB.join_code })).error?.code).toBe("42501");
    });

    it("a student cannot add themself to a class without join_class", async () => {
      const { error } = await loner.client.from("class_members").insert({ student_id: loner.id, class_id: classA.id, consent_at: new Date().toISOString() });
      expect(error?.code).toBe("42501");
    });

    it("a student cannot browse classes to find codes", async () => {
      const { data } = await loner.client.from("classes").select("join_code");
      expect(data).toEqual([]);
    });
  });

  describe("who sees whom", () => {
    it("teacher A sees their own student and nobody from class B", async () => {
      const members = await teacherA.client.from("class_members").select("student_id");
      expect(members.data?.map((m) => m.student_id)).toEqual([studentA.id]);
      const profiles = await teacherA.client.from("profiles").select("id");
      expect(profiles.data?.map((p) => p.id).sort()).toEqual([teacherA.id, studentA.id].sort());
    });

    it("a student sees only themself and their own class", async () => {
      expect((await studentA.client.from("profiles").select("id")).data?.map((p) => p.id)).toEqual([studentA.id]);
      expect((await studentA.client.from("classes").select("id")).data?.map((c) => c.id)).toEqual([classA.id]);
      expect((await studentA.client.from("class_members").select("student_id")).data?.map((m) => m.student_id)).toEqual([studentA.id]);
    });

    it("an admin sees every class", async () => {
      const ids = (await adminUser.client.from("classes").select("id")).data?.map((c) => c.id) ?? [];
      expect(ids).toEqual(expect.arrayContaining([classA.id, classB.id]));
    });

    it("a visitor who isn't signed in can read nothing", async () => {
      for (const table of ["profiles", "classes", "class_members"]) {
        // Refused outright (no privileges) or an empty answer; never a row.
        const { data } = await anonymous().from(table).select("*");
        expect(data ?? [], table).toEqual([]);
      }
    });
  });

  describe("leaving", () => {
    it("teacher B cannot remove teacher A's student; teacher A can", async () => {
      expect((await teacherB.client.from("class_members").delete().eq("student_id", studentA.id).select()).data).toEqual([]);
      expect((await teacherA.client.from("class_members").delete().eq("student_id", studentA.id).select()).data).toHaveLength(1);
    });
  });
});
