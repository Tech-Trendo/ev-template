import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full border border-[#E8E8E5] rounded-xl bg-white px-4 py-3 text-[14px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors";

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-[400px] bg-white border border-[#E8E8E5] rounded-xl p-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0B3D2B] text-[14px] font-black text-white">
            EV
          </span>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-[#0B3D2B]">
              EV OS
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#10B981]">
              Admin Console
            </span>
          </div>
        </div>
        <h1 className="text-[28px] font-black tracking-tight text-[#0B3D2B] mb-1">Sign in.</h1>
        <p className="text-[13px] text-[#737373] mb-8">Content and customer management console.</p>

        <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1">
          Username or Email
        </label>
        <input
          type="text"
          required
          autoFocus
          autoComplete="username"
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1 mt-5">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className={`${inputClass} pr-10`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#0B3D2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] rounded p-1"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && (
          <p className="mt-4 text-[12px] font-medium text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-8 w-full py-4 rounded-full bg-[#0B3D2B] text-white text-[13px] font-semibold tracking-[0.08em] uppercase hover:bg-[#10B981] transition-colors disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign In"}
        </button>

        <a
          href="/"
          className="mt-3 w-full flex items-center justify-center gap-2 py-4 border border-[#E8E8E5] rounded-full bg-white text-[#737373] text-[13px] font-semibold tracking-[0.08em] uppercase hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Home
        </a>
      </form>
    </div>
  );
}
