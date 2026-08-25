#抽象成api工厂 由factory定义不同api厂家的统一调用方式
from model.model_types import *
from skin_care_agent.ai_gateaway_proxy.open_ai_chat_completion_protocol import *
from anthropic_api_protocol import *
from config.open_api_config import *
from open_ai_chat_completion_protocol import *
from openai import  AsyncOpenAI


providers = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "xxx"
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "api_key": "yyy"
    },
    "glm": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        "api_key": "zzz"
    },
    "minimax":{
        "base_url": "https://api.minimaxi.com/v1",
        "api_key": "zzz"
    }
}

class OpenAIChatCompletionAdapter:
      def __init__(self, client):
          self.client = client

      def call(self, model_name, model_input,type):
           match type:
                case "text_only":
                    return default_api_call(model_name,model_input,self.client)
                case _:
                    return image_api_call(model_name,model_input,self.client) 

          
def client_choose(api_supplier:str):
    config = providers[api_supplier]
    return AsyncOpenAI(
         base_url = config["base_url"] ,
         api_key=config["api_key"]
    )