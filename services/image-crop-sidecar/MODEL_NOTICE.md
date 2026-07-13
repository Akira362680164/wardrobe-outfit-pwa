# u2netp deployment gate

The model file is intentionally not committed. The locally evaluated file was
`u2netp.onnx`, SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`.

Known provenance: rembg identifies its download as
`https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx`
and the upstream architecture/source as `xuebinqin/U-2-Net`. rembg is MIT and
the upstream source repository is Apache-2.0. This does not by itself prove
that the redistributed ONNX weights have production-distribution clearance.

Production must remain disabled until an approved model file is supplied by
deployment configuration and legal/owner review records the weight license.
At deployment, verify the approved SHA-256 and set both:

- `IMAGE_CROP_SIDECAR_COMMAND=/absolute/path/to/wardora-crop-sidecar`
- `IMAGE_CROP_MODEL_PATH=/absolute/path/to/reviewed/u2netp.onnx`

The worker has no network code, receives one image on stdin, writes one JSON
suggestion on stdout, and does not persist source images or previews.
