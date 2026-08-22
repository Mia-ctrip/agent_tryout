#核心调度；负责 provider 选择、重试、fallback、熔断和调用记录。
from config.open_api_config import *
from factory import * 
import logging

logger = logging.getLogger(__name__)

#模型降级顺序就先用list实现 
chat_only_model_list=["Deepseek V4 Flash","Qwen3.7","GLM5.2"]
pic_model_list=["Minimax","Doubao"]


def api_call_link(type, model_input) -> object:
    model_list = []
    model_output : ModelOutput | None = None
    match type:
        case "chat_only_model":
            model_list = chat_only_model_list
        case "pic_model":
            model_list = pic_model_list
        case _:
            model_list = pic_model_list      
    for model in model_list:
        result = call_with_retry(model,model_input)
        if result is not None:
            return result
        else:
            continue
    if model_output is None:
        return  parse_default_message(DEFAULT_MODEL_RETURN)    





def call_with_retry(model,model_input)->ModelOutput:
    model_output:ModelOutput|None=None
    try:
        for i in DEFAULT_MODEL_RETRY_TIMES:
            model_output = model_call(model,model_input)
            if model_output.response is None :
                continue
        return model_output
    except:
        logger.error("模型%s %s调用均失败:%s", model,DEFAULT_MODEL_RETRY_TIMES,error)


