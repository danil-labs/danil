/** No registrar mensajes ni URLs: pueden contener tokens o datos de la persona. */
export function logDependency(operation, cause) {
  console.error({ operation, ...(cause instanceof Response ? { status: cause.status } : { cause: cause instanceof Error ? cause.name : "invalid_response" }) });
}

export function dependencyProblem(code, status = 503) {
  logDependency(code, new Response(null, { status }));
  return Response.json({ type: "about:blank", title: code, status, error: code }, {
    status,
    headers: { "Content-Type": "application/problem+json", "Retry-After": "1", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
