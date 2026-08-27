# 外部请求的主要入口 负责定义对skin care service的主要方法
from model.service_entity import *
from model.model_types import *
from ai_gateaway import call
from utils.file_utils import * 

#用户单次记录的皮肤状态分析
def single_spot_analysis(single_spot_analysis_request:SingleSpotAnalysisRequest) -> SingleSpotAnalysisResponse:
    "'输入单张照片 对选定区域的肤况进行判断'"
    input = parse_single_spot_analysis_request(single_spot_analysis_request)
    api_result = call("pic_model",input)
    spot_analysis_result = parse_single_spot_analysis_result(api_result)
    return spot_analysis_result


#两次照片的皮肤状态对比
def skin_compare_analysis(skin_compare_analysis_request:SkinCompareAnalysisRequest)->str:
    input = parse_skin_compare_analysis_request(skin_compare_analysis_request)
    api_result = call("pic_model",input)
    spot_analysis_result = parse_skin_compare_analysis_result(api_result)
    return spot_analysis_result


#皮肤状态趋势分析
def skin_trendency_analysis(skin_condition_trendency_analysis_request:SkinTrendencyAnalysisRequest) -> str:
    input = parse_skin_condition_trendency_analysis_request(skin_condition_trendency_analysis_request)
    api_result = api_call_link("chat_only_model",input)
    spot_analysis_result = parse_skin_condition_trendency_analysis_result(api_result)
    return spot_analysis_result


def parse_single_spot_analysis_request(single_spot_analysis_request:SingleSpotAnalysisRequest) -> ModelInput:
    model_input = ModelInput(
        system_prompt = read_text_file("skin_care_agent/ai_gateaway_proxy/prompt/single_spot_prompt.md"),
        user_content = single_spot_analysis_request.user_content,
        pic_url_list = [{
            "url":single_spot_analysis_request.pic
        }]
    )
    return model_input


def parse_skin_compare_analysis_request(skin_compare_analysis_request:SkinCompareAnalysisRequest) -> ModelInput:
    pic_url_list=[]
    pic_url_list.append(skin_compare_analysis_request.pic_new)
    pic_url_list.append(skin_compare_analysis_request.pic_old)
    model_input = ModelInput(
        system_prompt = read_text_file("skin_care_agent/ai_gateaway_proxy/prompt/skin_compare_prompt.md"),
        user_content = skin_compare_analysis_request.user_content,
        pic_url_list = pic_url_list
    )
    return model_input


def parse_single_spot_analysis_result(model_output) -> SingleSpotAnalysisResponse:
    return