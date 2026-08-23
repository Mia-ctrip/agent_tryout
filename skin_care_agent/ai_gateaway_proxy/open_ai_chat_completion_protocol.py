#用于明确各家api的open ai协议的调用方式
from model.model_types import *
from openai import OpenAI

client = OpenAI()


def default_api_call(model:str,input:ModelInput)->ModelOutput:
    system_prompt = input.system_prompt
    user_content = input.user_content
    completion = client.chat.completions.create(
    model=model,
    messages=[
        {"role": "developer", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]
    )
    print(completion.choices[0].message)
    return parse_message(completion.choices[0].message)



def image_api_call(model:str,input:ModelInput)->ModelOutput:
    system_prompt = input.system_prompt
    user_content = input.user_content
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                  "role": "developer",
                  "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_content},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg",
                        }
                    },
                ],
            }
        ],
        max_tokens=300,
    )
    print(completion.choices[0])
    return parse_message(completion.choices[0].message)







def parse_message(model_response:str)->ModelOutput:
    return ModelOutput(model_response)