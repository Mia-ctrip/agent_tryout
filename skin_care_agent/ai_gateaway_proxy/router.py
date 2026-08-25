
from model.model_types import ModelInput,ModelOutput


#模型降级顺序就先用list实现 
chat_only_model_dict=[
    {
        "model_name":"Deepseek V4 Flash",
        "model_supplier":"deepseek"
    },
    {
        "model_name":"kimi-k3",
        "model_supplier":"kimi"
    },
    {
        "model_name":"GLM-5.2",
        "model_supplier":"glm"
    }
]


pic_model_list=[
    {
        "model_name":"GLM-4.6v",
        "model_supplier":"glm"
    },
    {
        "model_name":"Minimax 3",
        "model_supplier":"minimax"
    },
    {
        "model_name":"Doubao SeedDance 2.0",
        "model_supplier":"doubao"
    }
]


def api_call_link(capability) -> list:
    match type:
        case "chat_only_model":
            return chat_only_model_list
        case "pic_model":
            return pic_model_list
        case _:
            return pic_model_list      
      

