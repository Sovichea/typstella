import "./style.css";
import { TypstryWorkspaceController } from "./appController";
import { initializeLucideIcons } from "./ui/icons";

document.addEventListener("DOMContentLoaded", () => {
  initializeLucideIcons();
  void new TypstryWorkspaceController().bootstrap();
});
