// AudioWorklet: копирует входные блоки микрофона и пачками по ~10 мс отправляет в воркер анализа.
// Тяжёлой работы здесь нет — аудиопоток не должен задерживаться.

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.port2 = null
    this.batch = 512
    this.bufs = null
    this.fill = 0
    this.startFrame = 0
    this.port.onmessage = (e) => {
      if (e.data && e.data.port) this.port2 = e.data.port
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0 || !this.port2) return true
    const nch = Math.min(2, input.length)
    if (!this.bufs || this.bufs.length !== nch) {
      this.bufs = Array.from({ length: nch }, () => new Float32Array(this.batch))
      this.fill = 0
    }
    const n = input[0].length
    if (this.fill + n > this.batch) this.flush(nch)
    if (this.fill === 0) this.startFrame = currentFrame
    for (let c = 0; c < nch; c++) this.bufs[c].set(input[c].subarray(0, Math.min(n, this.batch)), this.fill)
    this.fill += Math.min(n, this.batch)
    if (this.fill >= this.batch) this.flush(nch)
    return true
  }

  flush(nch) {
    if (!this.fill) return
    const out = this.bufs.map((b) => b.slice(0, this.fill))
    this.port2.postMessage({ frame: this.startFrame, sr: sampleRate, data: out }, out.map((b) => b.buffer))
    this.bufs = Array.from({ length: nch }, () => new Float32Array(this.batch))
    this.fill = 0
  }
}

registerProcessor('vc-capture', CaptureProcessor)
