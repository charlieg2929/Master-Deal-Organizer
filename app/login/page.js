"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Wrong email or password. Try again.");
      return;
    }
    router.replace("/");
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <p style={styles.title}>Field Ledger</p>
        <p style={styles.subtitle}>Sign in to Tier 1's prospecting tracker</p>

        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@tier1properties.com"
          required
          autoFocus
        />

        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p style={styles.hint}>
          No self-signup — accounts are created directly by the account owner in Supabase.
        </p>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "80vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    background: "#F3EEDF",
    color: "#16283A",
    borderRadius: 12,
    padding: "28px 24px",
    width: "100%",
    maxWidth: 360,
    fontFamily: "Inter, sans-serif",
  },
  title: {
    fontFamily: "'Special Elite', monospace",
    fontSize: 20,
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: 13,
    color: "#2C4A63",
    margin: "0 0 20px",
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "#2C4A63",
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    width: "100%",
    fontSize: 14,
    padding: "9px 10px",
    borderRadius: 6,
    border: "1px solid rgba(22,40,58,0.25)",
    background: "#FFFDF6",
    color: "#16283A",
  },
  button: {
    width: "100%",
    marginTop: 20,
    padding: "10px 16px",
    borderRadius: 6,
    border: "1px solid #16283A",
    background: "#16283A",
    color: "#F3EEDF",
    fontWeight: 500,
    fontSize: 14,
    cursor: "pointer",
  },
  error: {
    color: "#A8452F",
    fontSize: 12,
    marginTop: 10,
  },
  hint: {
    fontSize: 11,
    color: "#6E8299",
    marginTop: 16,
    textAlign: "center",
  },
};
