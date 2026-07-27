export interface GarmentWearState {
  worn: boolean;
  wornAt: string;
  wearEventId: string;
  wornDates: string[];
}

export function garmentWearState(
  payload: Record<string, unknown>,
): GarmentWearState {
  const wornAt = typeof payload.wornAt === "string" ? payload.wornAt : "";
  const wearEventId =
    typeof payload.wearEventId === "string" ? payload.wearEventId : "";
  const worn = payload.worn === true;
  const wornDates = Array.isArray(payload.wornDates)
    ? payload.wornDates.filter(
        (value): value is string =>
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
      )
    : [];
  const directDate = worn ? wornAt.slice(0, 10) : "";

  return {
    worn,
    wornAt,
    wearEventId,
    wornDates: Array.from(
      new Set([
        ...wornDates,
        ...(directDate && /^\d{4}-\d{2}-\d{2}$/.test(directDate)
          ? [directDate]
          : []),
      ]),
    ).sort(),
  };
}

export function serverConfirmedGarmentMark(
  payload: Record<string, unknown>,
  dateKey: string,
): boolean {
  const state = garmentWearState(payload);
  return (
    state.worn &&
    state.wornAt.slice(0, 10) === dateKey &&
    Boolean(state.wearEventId)
  );
}

export function serverConfirmedGarmentCancel(
  payload: Record<string, unknown>,
): boolean {
  return (
    payload.worn === false &&
    payload.wornAt === null &&
    payload.wearEventId === null
  );
}
