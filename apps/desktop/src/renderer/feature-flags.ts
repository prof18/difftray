type FeatureFlags = {
  /**
   * Shows every App Store reference for the mobile companion app. Keep this
   * `false` while the iOS listing is unavailable, and flip it back to `true`
   * once the app is published again. Nothing else has to change.
   */
  readonly iosCompanionStoreEnabled: boolean;
};

export const featureFlags: FeatureFlags = {
  iosCompanionStoreEnabled: false
};
