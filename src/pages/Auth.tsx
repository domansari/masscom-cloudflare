import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import QRCode from "qrcode";

type LoginMethod = "password" | "otp";

export default function Auth() {
  const [method, setMethod] = useState<LoginMethod>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupRequested, setSetupRequested] = useState(false);
  const [setupQr, setSetupQr] = useState("");
  const [setupUri, setSetupUri] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoverMode, setRecoverMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const { signIn, signInWithOtp, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  function showError(message: string) {
    toast({
      title: "Authentication failed",
      description: message,
      variant: "destructive"
    });
  }

  async function startSetup() {
    const response = await fetch("/api/auth/totp/setup", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to start setup");
    }

    const uri = data.otpauth_uri;
    const image = await QRCode.toDataURL(uri);

    setSetupUri(uri);
    setSetupQr(image);
    setSetupMode(true);
    setCode("");
  }

  async function startRecovery() {
    const response = await fetch("/api/auth/totp/recover", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        recovery_code: recoveryCode.trim().toUpperCase()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to recover authenticator");
    }

    if (typeof data.otpauth_uri !== "string") {
      throw new Error("Replacement setup unavailable");
    }

    const image = await QRCode.toDataURL(data.otpauth_uri);
    setSetupUri(data.otpauth_uri);
    setSetupQr(image);
    setSetupMode(true);
    setRecoverMode(false);
    setRecoveryCode("");
    setPassword("");
    setCode("");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      if (recoverMode) {
        const result = await signIn(email, password);

        if (result.error) {
          throw new Error(result.error.message);
        }

        if (result.role === "verifier") {
          navigate("/");
          return;
        }

        await startRecovery();
        return;
      }

      if (setupMode) {
        const response = await fetch("/api/auth/totp/activate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Incorrect code");
        }

        toast({
          title: "Google Authenticator activated",
          description: "You can now use OTP login."
        });

        if (!Array.isArray(data.recovery_codes) ||
            data.recovery_codes.length !== 8) {
          throw new Error("Recovery codes unavailable. Contact administrator.");
        }

        setRecoveryCodes(data.recovery_codes);
        setSetupMode(false);
        setSetupQr("");
        setSetupUri("");
        setCode("");
        return;
      }

      const result = method === "password"
        ? await signIn(email, password)
        : await signInWithOtp(email, code);

      if (result.error) {
        showError(result.error.message);
        return;
      }

      if (method === "password" && "role" in result && result.role === "admin" && setupRequested) {
        await startSetup();
        return;
      }

      navigate("/");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-white">
            Staff Login
          </CardTitle>
          <CardDescription className="text-gray-300">
            MASSCOM Certificate Management
          </CardDescription>
        </CardHeader>

        <CardContent>
          {recoveryCodes.length > 0 ? (
            <div className="space-y-4 text-white">
              <h3 className="font-semibold text-center">
                Save Your Recovery Codes
              </h3>
              <p className="text-sm text-gray-200">
                These codes are displayed only once.
                Store them somewhere secure, separate from your phone.
                Do not share them.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {recoveryCodes.map(code => (
                  <div key={code} className="rounded bg-black/30 p-2 text-center">
                    {code}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  setRecoveryCodes([]);
                  navigate("/");
                }}
              >
                I Have Saved My Codes
              </Button>
            </div>
          ) : (
            <>
          {!setupMode && !recoverMode && (
            <div className="grid grid-cols-2 gap-2 mb-6">
              <Button
                type="button"
                variant={method === "password" ? "default" : "outline"}
                onClick={() => {
                  setMethod("password");
                  setCode("");
                  setSetupRequested(false);
                }}
              >
                Password
              </Button>
              <Button
                type="button"
                variant={method === "otp" ? "default" : "outline"}
                onClick={() => {
                  setMethod("otp");
                  setPassword("");
                  setSetupRequested(false);
                }}
              >
                Authenticator
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {recoverMode ? (
              <>
                <p className="text-sm text-gray-200">
                  Sign in with your existing password and enter one unused
                  recovery code to register a replacement authenticator.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="recoverEmail" className="text-white">
                    Email
                  </Label>
                  <Input
                    id="recoverEmail"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recoverPassword" className="text-white">
                    Password
                  </Label>
                  <Input
                    id="recoverPassword"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recoveryCode" className="text-white">
                    Unused recovery code
                  </Label>
                  <Input
                    id="recoveryCode"
                    placeholder="XXXXXXXX-XXXXXXXX"
                    autoComplete="off"
                    value={recoveryCode}
                    onChange={e => setRecoveryCode(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : setupMode ? (
              <>
                <p className="text-white text-sm text-center">
                  Scan this QR code using Google Authenticator,
                  then enter the 6-digit code to activate.
                </p>

                {setupQr && (
                  <img
                    src={setupQr}
                    alt="Google Authenticator setup QR code"
                    className="mx-auto w-52 h-52 bg-white p-2 rounded"
                  />
                )}

                <p className="text-gray-300 text-xs text-center">
                  Keep this QR code private.
                </p>

                <Label htmlFor="setupCode" className="text-white">
                  Authenticator code
                </Label>
                <Input
                  id="setupCode"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                {method === "password" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-white">
                        Password
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                      />
                    </div>

                    {profile?.role !== "verifier" && <label className="flex items-center gap-2 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={setupRequested}
                        onChange={e => setSetupRequested(e.target.checked)}
                      />
                      Set up Google Authenticator after admin login
                    </label>}
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-white">
                      6-digit Google Authenticator code
                    </Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      required
                    />
                  <p className="text-xs text-gray-300">
                      Administrators can activate Google Authenticator using the Password tab.
                    </p>
                  </div>
                )}
              </>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait..."
                : setupMode
                  ? "Activate Authenticator"
                  : recoverMode
                    ? "Recover Authenticator"
                    : "Sign In"}
            </Button>
          </form>

          {!setupMode && profile?.role !== "verifier" && (
            <Button
              type="button"
              variant="link"
              className="w-full mt-3 text-white"
              disabled={loading}
              onClick={() => {
                setRecoverMode(!recoverMode);
                setSetupRequested(false);
                setRecoveryCode("");
              }}
            >
              {recoverMode
                ? "Back to Login"
                : "Recover Google Authenticator"}
            </Button>
          )}

          {setupMode && (
            <Button
              type="button"
              variant="link"
              className="w-full mt-3 text-white"
              onClick={() => navigate("/")}
            >
              Finish later
            </Button>
          )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
