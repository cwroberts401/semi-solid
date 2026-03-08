/**
 * Dagger CI/CD pipeline for the semi-solid monorepo
 *
 * Provides containerized test, build, and deploy functions for the
 * multi-brand Shopify theme project.
 */
import {
  dag,
  Container,
  Directory,
  Secret,
  object,
  func,
  argument,
} from "@dagger.io/dagger"

@object()
export class SemiSolid {
  /**
   * Base container with Node 22, pnpm, and dependencies installed
   */
  @func()
  baseEnv(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
  ): Container {
    return dag
      .container()
      .from("node:22-slim")
      .withExec(["corepack", "enable"])
      .withMountedCache(
        "/root/.local/share/pnpm/store/v3",
        dag.cacheVolume("pnpm-store"),
      )
      .withDirectory("/app", source)
      .withWorkdir("/app")
      .withExec(["pnpm", "install", "--frozen-lockfile"])
  }

  /**
   * Run unit tests
   */
  @func()
  async test(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
  ): Promise<string> {
    return this.baseEnv(source)
      .withExec(["pnpm", "exec", "vitest", "run", "--project", "unit"])
      .stdout()
  }

  /**
   * Build all workspace packages (tsup)
   */
  @func()
  buildPackages(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
  ): Container {
    return this.baseEnv(source).withExec(["pnpm", "run", "build:packages"])
  }

  /**
   * Build a single brand/locale theme
   */
  @func()
  buildTheme(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
    brand: string,
    locale: string,
  ): Container {
    return this.buildPackages(source)
      .withExec([
        "cp",
        "semi-solid.config.example.ts",
        "semi-solid.config.ts",
      ])
      .withExec([
        "pnpm",
        "exec",
        "semi-solid",
        "build",
        "--brand",
        brand,
        "--locale",
        locale,
      ])
  }

  /**
   * Build all brand/locale themes
   */
  @func()
  buildAllThemes(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
  ): Container {
    return this.buildPackages(source)
      .withExec([
        "cp",
        "semi-solid.config.example.ts",
        "semi-solid.config.ts",
      ])
      .withExec(["pnpm", "run", "build:all"])
  }

  /**
   * Export a built theme directory
   */
  @func()
  themeArtifact(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
    brand: string,
    locale: string,
  ): Directory {
    return this.buildTheme(source, brand, locale).directory(
      `/app/dist/${brand}/${locale}`,
    )
  }

  /**
   * Build and deploy a single theme to Shopify
   */
  @func()
  async deployTheme(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
    brand: string,
    locale: string,
    store: string,
    themeId: string,
    shopifyToken: Secret,
  ): Promise<string> {
    const themeDir = this.themeArtifact(source, brand, locale)

    return dag
      .container()
      .from("node:22-slim")
      .withExec([
        "npm",
        "install",
        "-g",
        "@shopify/cli",
        "@shopify/theme",
      ])
      .withDirectory("/theme", themeDir)
      .withSecretVariable("SHOPIFY_CLI_PARTNERS_TOKEN", shopifyToken)
      .withExec([
        "shopify",
        "theme",
        "push",
        "--path",
        "/theme",
        "--store",
        store,
        "--theme",
        themeId,
        "--allow-live",
      ])
      .stdout()
  }

  /**
   * Deploy all staging themes in parallel
   */
  @func()
  async deployStagingAll(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
    brandAEnStore: string,
    brandAFrStore: string,
    brandBEnStore: string,
    brandBDeStore: string,
    brandAEnThemeId: string,
    brandAFrThemeId: string,
    brandBEnThemeId: string,
    brandBDeThemeId: string,
    shopifyToken: Secret,
  ): Promise<string> {
    const deploys = [
      {
        brand: "brand-a",
        locale: "en",
        store: brandAEnStore,
        themeId: brandAEnThemeId,
      },
      {
        brand: "brand-a",
        locale: "fr",
        store: brandAFrStore,
        themeId: brandAFrThemeId,
      },
      {
        brand: "brand-b",
        locale: "en",
        store: brandBEnStore,
        themeId: brandBEnThemeId,
      },
      {
        brand: "brand-b",
        locale: "de",
        store: brandBDeStore,
        themeId: brandBDeThemeId,
      },
    ]

    const results = await Promise.all(
      deploys.map(({ brand, locale, store, themeId }) =>
        this.deployTheme(source, brand, locale, store, themeId, shopifyToken),
      ),
    )

    return results.join("\n")
  }
}
