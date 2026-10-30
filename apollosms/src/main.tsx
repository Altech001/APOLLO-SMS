import { createRoot } from "react-dom/client";
import { HelmetProvider } from 'react-helmet-async';
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
    <HelmetProvider>
        <App />
    </HelmetProvider>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/sw.js?v=2", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") void registration.update();
            });
        })
        .catch((error) => {
            console.warn("TINORA AI service worker registration failed", error);
        });
}
