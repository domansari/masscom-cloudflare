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

  const { signIn, signInWithOtp } = useAuth();
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
      credentials: "same-origin"
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
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

        navigate("/");
        return;
      }

      const result = method === "password"
        ? await signIn(email, password)
        : await signInWithOtp(email, code);

      if (result.error) {
        showError(result.error.message);
        return;
      }

      if (method === "password" && setupRequested) {
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
            Administrator Login
          </CardTitle>
          <CardDescription className="text-gray-300">
            MASSCOM Certificate Management
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!setupMode && (
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
            {setupMode ? (
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

                    <label className="flex items-center gap-2 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={setupRequested}
                        onChange={e => setSetupRequested(e.target.checked)}
                      />
                      Set up Google Authenticator after login
                    </label>
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
                      First-time users must activate Google Authenticator
                      using the Password tab.
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
                  : "Sign In"}
            </Button>
          </form>

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
        </CardContent>
      </Card>
    </div>
  );
}
