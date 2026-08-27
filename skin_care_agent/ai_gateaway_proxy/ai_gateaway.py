#核心调度；负责 provider 选择、重试、fallback、熔断和调用记录。
from config.open_api_config import *
from model.model_types import ModelOutput
from router import api_call_link
from factory import OpenAIChatCompletionAdapter,client_choose
import logging

logger = logging.getLogger(__name__)



#主入口
def call(capability,model_input)->ModelOutput:
    #通过模型能力 去router层获取模型fall back的调用链
    model_call_dict = api_call_link(capability)
    try:
        for model in model_call_dict:
            model_name = model["model_name"]
            model_supplier = model["model_supplier"]
            client = client_choose(model_supplier)
            model_adapter = OpenAIChatCompletionAdapter(client=client)
            for i in range(DEFAULT_MODEL_RETRY_TIMES):
                model_output = model_adapter.call(model_name, model_input,capability)
                if model_output.response is None :
                    continue
                return model_output
            logger.info("模型%s 调用结果%s",model_name,model_output)
    except:
        logger.error("调用失败，失败报错%s",error)

    


