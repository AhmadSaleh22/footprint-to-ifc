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
