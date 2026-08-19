import { useEffect, useRef } from "react";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function GoogleSignInButton({ onCredential, disabled }) {
  const divRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const render = () => {
      if (!window.google?.accounts?.id || !divRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(divRef.current, {
        theme: "outline",
        size: "large",
        width: 360,
        text: "continue_with",
        locale: "fr",
      });
    };

    if (window.google?.accounts?.id) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) return null;

  return <div ref={divRef} className={disabled ? "opacity-50 pointer-events-none" : ""} data-testid="google-signin-btn" />;
}
