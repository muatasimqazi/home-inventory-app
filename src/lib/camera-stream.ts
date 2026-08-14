// Kept as module-scope state (not component state) so a live camera stream
// survives this module's owning page unmounting/remounting on client-side
// navigation — e.g. /capture -> /capture/review -> "Add another photo" back
// to /capture, or returning from the OS photo picker. Without this, every
// remount called getUserMedia again, which on some browsers/embeds doesn't
// silently reuse an already-granted permission the way a single persistent
// stream does — it reads to the user as being asked for camera access over
// and over despite already having granted it.
let sharedStream: MediaStream | null = null;

export function getSharedStream(): MediaStream | null {
  return sharedStream;
}

export function setSharedStream(stream: MediaStream | null) {
  sharedStream = stream;
}

export function hasLiveTracks(stream: MediaStream | null): boolean {
  const tracks = stream?.getTracks() ?? [];
  return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
}

/** Actually releases the camera — call only when the user is done with the whole capture flow (closing the camera, or finishing a save), not on every route remount. */
export function stopCameraStream() {
  sharedStream?.getTracks().forEach((t) => t.stop());
  sharedStream = null;
}
