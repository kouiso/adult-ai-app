import { useState, type FormEvent } from "react";

import { Button } from "@/component/ui/button";

type LoginFormProps = {
  onLogin: () => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [token, setToken] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedToken = token.trim();
    if (!trimmedToken) return;

    localStorage.setItem("auth_token", trimmedToken);
    window.location.hash = "#/";
    onLogin();
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm"
      >
        <label className="grid gap-2 text-sm font-medium" htmlFor="auth-token">
          アクセストークン
          <input
            id="auth-token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50"
            autoComplete="off"
            autoFocus
            type="text"
          />
        </label>
        <Button className="mt-4 w-full" type="submit" disabled={!token.trim()}>
          ログイン
        </Button>
      </form>
    </main>
  );
};
