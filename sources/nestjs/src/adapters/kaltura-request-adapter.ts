import { map, catchError } from 'rxjs/operators';
import { KalturaRequest } from '../api/kaltura-request';
import { Observable } from 'rxjs';

import { KalturaAPIException } from '../api/kaltura-api-exception';
import { KalturaClientException } from '../api/kaltura-client-exception';
import { KalturaRequestOptions } from '../api/kaltura-request-options';
import { KalturaClientOptions } from '../kaltura-client-options';
import { createEndpoint, getHeaders, prepareParameters } from './utils';
import { environment } from '../environment';
import { HttpService } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';

export class KalturaRequestAdapter {

  constructor(private http: HttpService) {
  }

  public transmit<T>(request: KalturaRequest<T>, clientOptions: KalturaClientOptions, defaultRequestOptions: KalturaRequestOptions): Observable<T>;
  public transmit<T>(request: KalturaRequest<any>, clientOptions: KalturaClientOptions, defaultRequestOptions: KalturaRequestOptions, format: string): Observable<any>;
  public transmit<T>(request: KalturaRequest<any>, clientOptions: KalturaClientOptions, defaultRequestOptions: KalturaRequestOptions, format: string, responseType: 'blob' | 'text'): Observable<any>;
  public transmit<T>(request: KalturaRequest<T>, clientOptions: KalturaClientOptions, defaultRequestOptions: KalturaRequestOptions, format?: string, responseType: 'blob' | 'text' = 'text'): Observable<any> {

    const requestSpecificFormat = typeof format !== 'undefined';
    const parameters = prepareParameters(request, clientOptions, defaultRequestOptions);

    const endpointOptions = { ...clientOptions, service: parameters['service'], action: parameters['action'], format };
    const endpointUrl = createEndpoint(request, endpointOptions);
    delete parameters['service'];
    delete parameters['action'];

    const config: AxiosRequestConfig = {
      url: endpointUrl,
      method: 'POST',
      data: parameters,
      responseType: requestSpecificFormat ? responseType || 'text' : 'json',
      headers: requestSpecificFormat ? undefined : getHeaders(),
    };
    return this.http.request(config)
      .pipe(
        catchError(
          error => {
            if (environment.response.customErrorInHttp500) {
              if (error && typeof error.error === 'string') {
                const actualError = JSON.parse(error.error).result.error;
                throw new KalturaAPIException(actualError.message, actualError.code, actualError.args);
              }
              if (error && error.error) {
                return Observable.create((observer) => {
                  const reader = new FileReader();
                  reader.addEventListener('loadend', (e) => {
                    const text = (e.srcElement as any).result;
                    const actualError = JSON.parse(text).result.error;
                    observer.error(new KalturaAPIException(actualError.message, actualError.code, actualError.args));
                  });

                  // Start reading the blob as text.
                  reader.readAsText(error.error);
                });
              }
            }

            const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
            throw new KalturaClientException('client::request-network-error', errorMessage || 'Error connecting to server');
          },
        ),
        map(
          result => {
            try {
              const response = request.handleResponse(result, requestSpecificFormat);

              if (response.error) {
                throw response;
              } else {
                return response;
              }
            } catch (error) {

              if (error.hasOwnProperty('error') && error.error instanceof KalturaAPIException) {
                throw error;
              }
              if (error instanceof KalturaClientException || error instanceof KalturaAPIException) {
                throw error;
              } else {
                const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
                throw new KalturaClientException('client::response-unknown-error', errorMessage || 'Failed to parse response');
              }
            }
          }));
  }
}
