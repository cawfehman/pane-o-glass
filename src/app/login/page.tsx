import { signIn } from "@/lib/auth"

export default function LoginPage() {
    return (
        <div className="login-container">
            <div className="login-card">
                <h1>Welcome Back</h1>
                <p>Sign in to your dashboard</p>
                <form
                    action={async (formData) => {
                        "use server"
                        await signIn("credentials", formData)
                    }}
                    className="login-form"
                >
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input name="username" id="username" type="text" required />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input name="password" id="password" type="password" required />
                    </div>
                    <button type="submit" className="btn-primary">Sign In</button>
                </form>
            </div>
        </div>
    )
}
