let sequence = 0;

export interface E2ETestAccount {
  phone: string;
  password: string;
}

export function createE2ETestAccount(): E2ETestAccount {
  sequence += 1;
  const suffix = `${Date.now()}${sequence}`
    .replace(/\D/g, "")
    .slice(-8)
    .padStart(8, "0");
  return {
    phone: `139${suffix}`,
    password: "E2eTest123!",
  };
}
