# 外部请求的主要入口 负责定义对skin care service的主要方法
from model.service_entity import *
from model.model_types import *
from ai_gateaway import *
from utils.file_utils import * 

#用户单次记录的皮肤状态分析
def single_spot_analysis(single_spot_analysis_request) -> SingleSpotAnalysisResponse:
    "'输入单张照片 对选定区域的肤况进行判断'"
    input = parse_single_spot_analysis_request(single_spot_analysis_request)
    api_result = api_call_link("pic_model",input)
    spot_analysis_result = parse_single_spot_analysis_result(api_result)
    return spot_analysis_result


#两次照片的皮肤状态对比
def skin_compare_analysis(system_prompt, user_prompt, pic1, pic2)->str:
    return


#皮肤状态趋势分析
def skin_trendency_analysis(system_prompt, user_prompt, trendency_records) -> str:
    return


def parse_single_spot_analysis_request(single_spot_analysis_request) -> ModelInput:
    model_input = ModelInput(
        system_prompt=read_text_file("skin_care_agent/ai_gateaway_proxy/prompt/single_spot_prompt.md")
    )
    return model_input

def parse_single_spot_analysis_result(model_output) -> SingleSpotAnalysisResponse:
    return