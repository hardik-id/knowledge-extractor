"use client";

import { useId, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { Tenant } from "@/services/access";
import { useAccessTenant } from "../tenant-context";
import { AddPersonDialog } from "./add-person-dialog";
import { MemberList } from "./member-list";

/** The Members tab: the tenant's people, a search, and "Add person". */
export function MembersTab() {
  const tenant = useAccessTenant();
  // Another tenant starts the tab over.
  return <Members key={tenant.id} tenant={tenant} />;
}

function Members({ tenant }: { tenant: Tenant }) {
  const searchId = useId();
  const [typed, setTyped] = useState("");
  const search = useDebouncedValue(typed.trim(), 300);
  // Counts up to read the list again.
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex w-full flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor={searchId}>Search members</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id={searchId}
              type="search"
              value={typed}
              placeholder="Name or sign-in name"
              autoComplete="off"
              className="pl-8"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        </div>
        <Button size="lg" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add person
        </Button>
      </div>

      {refusal && (
        <p role="alert" className="text-body text-danger">
          {refusal}
        </p>
      )}

      <MemberList
        key={`${search}|${version}`}
        tenant={tenant}
        search={search}
        onChanging={() => setRefusal(null)}
        onRefused={(sentence) => {
          setRefusal(sentence);
          setVersion((n) => n + 1);
        }}
      />

      <AddPersonDialog
        open={adding}
        onOpenChange={setAdding}
        tenant={tenant}
        onAdded={() => {
          setRefusal(null);
          setVersion((n) => n + 1);
        }}
      />
    </div>
  );
}
