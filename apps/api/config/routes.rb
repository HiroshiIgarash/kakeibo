Rails.application.routes.draw do
  post "/graphql", to: "graphql#execute"

  if Rails.env.development?
    mount GraphiQL::Rails::Engine, at: "/graphiql", graphql_path: "/graphql"
    # mount Sidekiq::Web, at: "/sidekiq"  # TODO: Sidekiq 8 web UI設定
  end
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :transactions, only: [ :create ]
    end
  end

  # Defines the root path route ("/")
  # root "posts#index"
end
