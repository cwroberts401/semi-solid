/**
 * Dagger CI/CD pipeline for the semi-solid monorepo
 *
 * Provides containerized test and build functions for the
 * framework packages.
 */
import {
  dag,
  Container,
  Directory,
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
      .withExec(["pnpm", "exec", "vitest", "run"])
      .stdout()
  }

  /**
   * Build all workspace packages (tsup)
   */
  @func()
  async buildPackages(
    @argument({
      defaultPath: "/",
      ignore: ["node_modules", ".git", "dist", ".dagger"],
    })
    source: Directory,
  ): Promise<string> {
    return this.baseEnv(source)
      .withExec(["pnpm", "run", "build:packages"])
      .stdout()
  }
}
