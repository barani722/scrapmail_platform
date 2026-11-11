import { cn } from "@/lib/utils";

export function FormAlert({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  if (!error && !message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg px-4 py-3 text-sm",
        error
          ? "bg-destructive/10 text-destructive"
          : "bg-green-50 text-green-800",
      )}
    >
      {error ?? message}
    </p>
  );
}
