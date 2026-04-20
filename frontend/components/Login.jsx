import { useState } from "react";

export default function Login({ onLogin }) {
    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
            const res = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("username", data.username);
                onLogin(data);
            } else {
                setError(data.error || "Login failed");
            }
        } catch {
            setError("Server unreachable");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={S.container}>
            <div style={S.card}>
                <h2 style={S.title}>IFC Asset Detection</h2>
                <p style={S.subtitle}>Sign in to access your project</p>

                <form onSubmit={handleSubmit} style={S.form}>
                    <div style={S.inputGroup}>
                        <label style={S.label}>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={S.input}
                            required
                        />
                    </div>

                    <div style={S.inputGroup}>
                        <label style={S.label}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={S.input}
                            placeholder="Enter admin password"
                            required
                        />
                    </div>

                    {error && <div style={S.error}>{error}</div>}

                    <button type="submit" disabled={loading} style={S.button}>
                        {loading ? "Signing in..." : "Login"}
                    </button>
                </form>

                <div style={S.footer}>
                    Default: <strong>admin</strong> / <strong>admin123</strong>
                </div>
            </div>
        </div>
    );
}

const S = {
    container: {
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0d1b2a 0%, #1b263b 100%)",
    },
    card: {
        padding: "40px",
        backgroundColor: "rgba(13, 27, 42, 0.95)",
        borderRadius: "16px",
        boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
        border: "1px solid #2a4d69",
        width: "350px",
        textAlign: "center",
    },
    title: {
        margin: "0 0 10px 0",
        color: "#4a9bff",
        fontSize: "24px",
    },
    subtitle: {
        margin: "0 0 30px 0",
        color: "#90a4ae",
        fontSize: "14px",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        textAlign: "left",
    },
    inputGroup: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
    },
    label: {
        fontSize: "12px",
        color: "#bbdefb",
        fontWeight: "600",
    },
    input: {
        padding: "12px",
        backgroundColor: "rgba(30, 58, 95, 0.3)",
        border: "1px solid #2a4d69",
        borderRadius: "8px",
        color: "white",
        fontSize: "14px",
        outline: "none",
    },
    button: {
        padding: "12px",
        backgroundColor: "#4a9bff",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "16px",
        fontWeight: "600",
        transition: "background 0.2s",
    },
    error: {
        color: "#f44336",
        fontSize: "14px",
        textAlign: "center",
    },
    footer: {
        marginTop: "20px",
        fontSize: "12px",
        color: "#90a4ae",
    }
};
