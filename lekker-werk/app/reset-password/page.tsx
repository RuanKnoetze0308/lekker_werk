import { Logo } from "@/components/brand/Logo";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Reset password · LekkerWerk" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-surface px-5 py-10">
      <div className="w-full max-w-md rounded-[24px] border border-border bg-white p-8">
        <Logo variant="dark" />
        <h1 className="mt-6 font-display text-2xl font-bold text-ink">Choose a new password</h1>
        <ResetPasswordForm token={token ?? ""} />
      </div>
    </main>
  );
}
