#用于明确各家api的open ai协议的调用方式
from model.model_types import *
from openai import OpenAI
from utils.file_utils import read_binary_file
import base64



def default_api_call(model:str,input:ModelInput,client)->ModelOutput:
    system_prompt = input.system_prompt
    user_content = input.user_content
    try:
        completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "developer", 
                "content": system_prompt
            },
            {
                "role": "user", 
                "content": user_content
            }
        ]
        )
        print(completion.choices[0].message)
        return parse_message(completion.choices[0].message)
    except:    
        return 



def image_api_call(model:str,input:ModelInput,client)->ModelOutput:
    system_prompt = input.system_prompt
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                  "role": "developer",
                  "content": system_prompt
            },
            {
                "role": "user",
                "content":origanize_batch_image(input)
            }
        ],
        max_tokens=300,
    )
    print(completion.choices[0])
    return parse_message(completion.choices[0].message)




def origanize_batch_image(input:ModelInput)->list:
    user_content = input.user_content
    #我的实现里先用BASE64实现，正式的app中实现应该用s3地址
    content = [
                    {  
                        "type": "text", 
                        "text": user_content
                    }
                ]
    for item in input.pic_url_dict:
        pic_relative_path = item['url']
        pic_type = item['type']
        image_bytes = read_binary_file(pic_relative_path)
        image_base64  = base64.b64encode(image_bytes).decode("utf-8")
        image_url = f"data:{pic_type};base64,{image_base64}"
        content.append(
            {
                "type": "image_url", 
                "image_url": image_url
            }
        )
    return content





def parse_message(model_response:str)->ModelOutput:
    print(model_response)
    return ModelOutput(model_response)


    