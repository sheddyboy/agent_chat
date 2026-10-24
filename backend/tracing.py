from config import settings
from phoenix.otel import register

tracer_provider = register(
    project_name=settings.phoenix_project,
    endpoint=settings.phoenix_endpoint,
    auto_instrument=True,
)
# Phoenix's tracer, which adds openinference_span_kind and span.set_input
tracer = tracer_provider.get_tracer(__name__)
