import { AppShell } from "@/components/layout/app-shell";

export default function PipelineLayout({ children }: LayoutProps<"/pipeline">) {
  return <AppShell>{children}</AppShell>;
}
