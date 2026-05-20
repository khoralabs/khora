import { renderRoute } from "../render-route";
import "../../styles/globals.css";

function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <p className="text-lg text-foreground">Hello, world!</p>
    </main>
  );
}

renderRoute(HomePage);
