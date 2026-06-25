import { closeDatabase } from "../db/client.js";
import { RegistrationService } from "../auth/registrations.js";

const registrationId = process.argv[2];

if (!registrationId) {
  console.error("Usage: node dist/cli/verify-pending-registration.js <registrationId>");
  process.exitCode = 1;
} else {
  try {
    const registration = await new RegistrationService().verifyPendingRegistrationWithDevelopmentCli(registrationId);
    console.log(
      JSON.stringify(
        {
          registrationId: registration.id,
          status: registration.status,
          verificationSource: registration.verificationSource,
          verifiedAt: registration.verifiedAt?.toISOString() ?? null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to verify registration");
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
