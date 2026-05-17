export function handleHealth(): Response {
  return new Response("ok", { status: 200 });
}
