// Traduction des erreurs du SDK Anthropic en messages affichables dans X.
// Isolé du point d'entrée pour être testable : importer index.ts enregistrerait
// les écouteurs Chrome au chargement du module.
import Anthropic, { type APIError } from "@anthropic-ai/sdk";

/** Message lisible de l'API : le corps d'erreur Anthropic est {type, error:{type, message}}. */
function apiMessage(err: APIError): string {
  const body = err.error as Anthropic.ErrorResponse | undefined;
  const message = body?.error?.message;
  return typeof message === "string" && message ? message : err.message;
}

/**
 * L'ordre compte : les classes du SDK héritent toutes d'APIError, la plus
 * générale doit donc être testée en dernier.
 */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Clé API invalide.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Accès refusé pour cette clé API.";
  if (err instanceof Anthropic.NotFoundError) return `Modèle indisponible pour cette clé : ${apiMessage(err)}`;
  if (err instanceof Anthropic.RateLimitError) return "Limite de requêtes atteinte, réessaie dans un instant.";
  if (err instanceof Anthropic.BadRequestError) return `Requête refusée : ${apiMessage(err)}`;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "Délai dépassé, réessaie.";
  if (err instanceof Anthropic.APIConnectionError) return "Impossible de joindre l'API Anthropic.";
  if (err instanceof Anthropic.APIError) {
    if (err.type === "overloaded_error") return "Service Anthropic surchargé, réessaie dans un instant.";
    return `Erreur API (${err.status ?? "?"}) : ${apiMessage(err)}`;
  }
  return err instanceof Error ? err.message : String(err);
}
