import { AccountDeletionService } from "./account-deletion.js";
import { createStorageProviderFromEnv } from "../storage/factory.js";
import { UnavailableStorageProvider } from "../storage/provider.js";

export async function retryPendingAccountDeletions(service?: AccountDeletionService) {
  const storage = createStorageProviderFromEnv() ?? new UnavailableStorageProvider();
  await (service ?? new AccountDeletionService({ storage })).retryPendingJobs();
}
