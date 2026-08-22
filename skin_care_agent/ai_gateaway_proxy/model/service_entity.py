# 定义skin care调用AI时的输入和输出

class SingleSpotAnalysisRequest:
    def __init__(self, user_prompt, pic):
        self.user_prompt = user_prompt
        self.pic = pic


class SingleSpotAnalysisResponse:
    def __init__(self):
        pass


class SkinCompareAnalysisRequest:
    def __init__(self,user_prompt, pic_old, pic_new):
        self.user_prompt = user_prompt
        self.pic_old = pic_old
        self.pic_new = pic_new


class SkinCompareAnalysisResponse:
    def __init__(self):
        pass

class SkinTrendencyAnalysisRequest:
    def __init__(self,user_prompt, skin_trendency_desc):
        self.user_prompt = user_prompt
        self.skin_trendency_desc

class SkinTrendencyAnalysisResponse:
    def __init__(self):
        pass        