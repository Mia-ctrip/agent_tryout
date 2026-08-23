# 定义所有API厂家的通用调用输入和输出

class ModelInput:
    def __init__ (self,system_prompt:str, user_content:str):
        self.system_prompt = system_prompt
        self.user_content = user_content

class ModelOutput:
    def __init__ (self,system_prompt:str):
        self._system_prompt = system_prompt        
