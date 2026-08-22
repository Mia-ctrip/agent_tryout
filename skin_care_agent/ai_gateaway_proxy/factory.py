#抽象成api工厂 由factory定义不同api厂家的统一调用方式
from model.model_types import *
from open_ai_api_protocol import *
from anthropic_api_protocol import *
from config.open_api_config import *

def model_call(model_name,model_input) -> ModelOutput:
    match DEFAULT_PROTOCAL:
        case "open_ai_api_protocol":
            
        case "anthropic_api_protocol":
            