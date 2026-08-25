# 定义所有API厂家的通用调用输入和输出

class ModelInput:
    def __init__ (self,system_prompt:str, user_content:str, pic_url_dict:dict):
        self.system_prompt = system_prompt
        self.user_content = user_content
        self.pic_url_dict = pic_url_dict

class ModelOutput:
    def __init__ (self,system_prompt:str):
        self._system_prompt = system_prompt        
