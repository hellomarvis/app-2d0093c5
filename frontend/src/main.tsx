import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./styles/tailwind.css";

// Read base path from env (set by builder pipeline for ALB path-based routing)
const basename = import.meta.env["VITE_BASE_PATH"] || "/";

const rootElement = document.querySelector("#root") as Element;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<React.StrictMode>
			<ErrorBoundary>
				<BrowserRouter basename={basename}>
					<App />
				</BrowserRouter>
			</ErrorBoundary>
		</React.StrictMode>
	);
}
