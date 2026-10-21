/** Why a footprint was rejected. Each reason is tied to one step of the pipeline in specs/01. */
export type FootprintErrorReason =
  | 'unsupported-geometry'
  | 'invalid-height'
  | 'invalid-coordinate'
  | 'outside-zone'
  | 'too-few-vertices'
  | 'zero-area'
  | 'self-intersection'

/** Thrown when a footprint cannot be turned into a valid building outline. */
export class InvalidFootprintError extends Error {
  readonly reason: FootprintErrorReason

  /**
   * @param reason Machine-readable cause.
   * @param message Human-readable detail. Defaults to the reason.
   */
  constructor(reason: FootprintErrorReason, message?: string) {
    super(message ?? reason)
    this.name = 'InvalidFootprintError'
    this.reason = reason
  }
}

/** Why a building could not be made from a footprint. Each reason is tied to one step of the pipeline in specs/02. */
export type BuildingErrorReason = 'invalid-footprint' | 'invalid-thickness' | 'thickness-too-large'

/** Thrown when walls cannot be built from a footprint and a thickness. */
export class InvalidBuildingError extends Error {
  readonly reason: BuildingErrorReason

  /**
   * @param reason Machine-readable cause.
   * @param message Human-readable detail. For `thickness-too-large` it starts with the id of the failing check
   *   (`4:`, `5a:`, `5b:` or `5d:`). Defaults to the reason.
   */
  constructor(reason: BuildingErrorReason, message?: string) {
    super(message ?? reason)
    this.name = 'InvalidBuildingError'
    this.reason = reason
  }
}
