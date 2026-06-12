import { App } from "./app";

const container = document.getElementById("app");
if (!container) throw new Error("#app container missing from index.html");

new App(container).start();
