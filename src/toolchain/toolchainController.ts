import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";

export type ToolchainStatus = {
  typstVersion: string | null;
  typstSource: string | null;
  tinymistVersion: string | null;
  tinymistSource: string | null;
  lspAvailable: boolean;
  message: string;
};

type TypstRelease = {
  version: string;
  publishedAt: string | null;
};

type ToolchainControllerOptions = {
  getSelectedVersion: () => string | null;
  setSelectedVersion: (version: string) => void;
  onToolchainChanged: (status: ToolchainStatus) => void | Promise<void>;
};

export class ToolchainController {
  private status: ToolchainStatus | null = null;
  private releases: TypstRelease[] = [];
  private loading = false;

  constructor(private readonly options: ToolchainControllerOptions) {}

  public initialize() {
    document.getElementById("settings-typst-version")?.addEventListener("change", event => {
      const version = (event.currentTarget as HTMLSelectElement).value;
      if (version && version !== this.status?.typstVersion) void this.install(version);
    });
    document.getElementById("settings-toolchain-refresh")?.addEventListener("click", () => {
      void this.refresh(true);
    });
    document.addEventListener("typstry:settings-opened", () => void this.refresh(false));
    document.querySelector('[data-settings-panel="toolchain"]')?.addEventListener("click", () => {
      void this.refresh(false);
    });
    this.render();
  }

  public setStatus(status: ToolchainStatus) {
    this.status = status;
    this.render();
  }

  public async refresh(forceReleases: boolean) {
    if (this.loading) return;
    this.loading = true;
    this.render("Checking installed tools...");
    let refreshError: string | null = null;
    try {
      const [status, releases] = await Promise.all([
        invoke<ToolchainStatus>("get_toolchain_status"),
        forceReleases || this.releases.length === 0
          ? invoke<TypstRelease[]>("list_typst_releases")
          : Promise.resolve(this.releases)
      ]);
      this.status = status;
      this.releases = releases;
      this.render();
    } catch (error) {
      refreshError = `Unable to refresh releases: ${String(error)}`;
    } finally {
      this.loading = false;
      this.render(refreshError ?? undefined, Boolean(refreshError));
    }
  }

  private async install(version: string) {
    if (this.loading) return;
    this.loading = true;
    this.render(`Downloading Typst ${version} and its matching stable Tinymist...`);
    try {
      const status = await invoke<ToolchainStatus>("install_typst_toolchain", { version });
      this.status = status;
      this.options.setSelectedVersion(version);
      await this.options.onToolchainChanged(status);
      if (!status.lspAvailable) {
        await message(
          `${status.message}\n\nTypstry will use the Typst compiler for preview. LSP completion, hover, live preview, and preview sync are unavailable for this version.`,
          { title: "Tinymist unavailable", kind: "warning" }
        );
      }
    } catch (error) {
      try {
        const status = await invoke<ToolchainStatus>("get_toolchain_status");
        this.status = status;
        if (status.typstVersion === version) this.options.setSelectedVersion(version);
        await this.options.onToolchainChanged(status);
      } catch (statusError) {
        console.error("Failed to recover toolchain status after installation error", statusError);
      }
      await message(String(error), { title: "Toolchain installation failed", kind: "error" });
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(overrideMessage?: string, isError = false) {
    const select = document.getElementById("settings-typst-version") as HTMLSelectElement | null;
    if (select) {
      const current = this.status?.typstVersion;
      const versions = [...this.releases];
      if (current && /^\d+\.\d+\.\d+$/.test(current) && !versions.some(release => release.version === current)) {
        versions.unshift({ version: current, publishedAt: null });
      }
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = this.loading && versions.length === 0
        ? "Loading stable releases..."
        : "Select a stable version";
      select.replaceChildren(placeholder, ...versions.map(release => {
        const option = document.createElement("option");
        option.value = release.version;
        option.textContent = `${release.version}${release.version === current ? " (current)" : ""}`;
        return option;
      }));
      select.value = current ?? this.options.getSelectedVersion() ?? "";
      select.disabled = this.loading;
    }

    const typstMeta = document.getElementById("settings-typst-current");
    if (typstMeta) {
      typstMeta.textContent = this.status?.typstVersion
        ? `Current: ${this.status.typstVersion} · ${this.status.typstSource ?? "Unknown source"}`
        : "Typst is not installed";
    }
    const tinymist = document.getElementById("settings-tinymist-version") as HTMLInputElement | null;
    if (tinymist) tinymist.value = this.status?.tinymistVersion ?? "Not available";
    const tinymistMeta = document.getElementById("settings-tinymist-current");
    if (tinymistMeta) tinymistMeta.textContent = this.status?.tinymistSource ?? "No compatible stable release installed";
    const status = document.getElementById("settings-toolchain-status");
    if (status) {
      status.textContent = overrideMessage ?? this.status?.message ?? "Open this panel to check tool versions.";
      status.classList.toggle("error", isError);
      status.classList.toggle("warning", !isError && Boolean(this.status && !this.status.lspAvailable));
    }
    const refresh = document.getElementById("settings-toolchain-refresh") as HTMLButtonElement | null;
    if (refresh) refresh.disabled = this.loading;
  }
}
