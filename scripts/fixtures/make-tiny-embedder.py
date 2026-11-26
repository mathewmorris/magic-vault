"""Build scripts/fixtures/tiny-embedder.onnx, a stand-in for the card embedder.

It has the real model's input and output shapes (float32 [1, 3, 448, 320] in,
[1, 256] out) so tests can run the indexer's ONNX path without downloading
the real model:

    input -> GlobalAveragePool -> Flatten -> MatMul (fixed 3x256) -> embedding

The output only depends on the image's mean color, which is all a test needs.

    pip3 install --user onnx
    python3 scripts/fixtures/make-tiny-embedder.py
"""

import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HEIGHT, WIDTH, DIMS = 448, 320, 256

rng = np.random.default_rng(20261126)
weights = rng.standard_normal((3, DIMS)).astype(np.float32)

graph = helper.make_graph(
    nodes=[
        helper.make_node("GlobalAveragePool", ["input"], ["pooled"]),
        helper.make_node("Flatten", ["pooled"], ["flat"], axis=1),
        helper.make_node("MatMul", ["flat", "weights"], ["embedding"]),
    ],
    name="tiny-embedder",
    inputs=[helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, HEIGHT, WIDTH])],
    outputs=[helper.make_tensor_value_info("embedding", TensorProto.FLOAT, [1, DIMS])],
    initializer=[numpy_helper.from_array(weights, name="weights")],
)

# Opset 13 and IR 8 load in every recent onnxruntime.
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)], producer_name="magic-vault")
model.ir_version = 8
onnx.checker.check_model(model)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiny-embedder.onnx")
onnx.save(model, out)
print(f"wrote {out} ({os.path.getsize(out)} bytes)")
