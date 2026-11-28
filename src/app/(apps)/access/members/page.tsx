import type { Metadata } from "next";
import { MembersTab } from "@/apps/access/members/members-tab";

export const metadata: Metadata = { title: "Members" };

export default function AccessMembersPage() {
  return <MembersTab />;
}
