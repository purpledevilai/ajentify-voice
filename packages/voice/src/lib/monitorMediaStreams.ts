/**
 * Hook a Web Audio analyser onto a microphone stream and call back with
 * the running average frequency-bin amplitude (~0-255) every animation
 * frame. Returns a `stop` function that releases the analyser, the
 * source, and the audio context.
 */
export function monitorMicStream(
  stream: MediaStream,
  onVolume: (volume: number) => void
): () => void {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  source.connect(analyser);

  let raf = 0;
  let stopped = false;

  const update = () => {
    if (stopped) return;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]!;
    onVolume(sum / dataArray.length);
    raf = requestAnimationFrame(update);
  };

  update();

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    try {
      source.disconnect();
    } catch {}
    try {
      analyser.disconnect();
    } catch {}
    void audioContext.close();
  };
}

/**
 * Same shape as {@link monitorMicStream} but intended for a remote
 * inbound `MediaStream` (the agent's audio). Returns a `stop` function.
 */
export function monitorInboundMediaStream(
  stream: MediaStream,
  onVolume: (volume: number) => void
): () => void {
  return monitorMicStream(stream, onVolume);
}
