export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./db/bootstrap");
    await bootstrap();
  }
}
