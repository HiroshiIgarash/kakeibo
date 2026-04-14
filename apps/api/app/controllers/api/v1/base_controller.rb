module Api
  module V1
    class BaseController < ApplicationController
      before_action :authenticate_api_key!

      private

        def authenticate_api_key!
          api_key = request.headers["X-API-Key"]
          return if api_key.present? && ActiveSupport::SecurityUtils.secure_compare(api_key, ENV["API_KEY"].to_s)

          render json: { error: "Unauthorized" }, status: :unauthorized
        end
    end
  end
end
